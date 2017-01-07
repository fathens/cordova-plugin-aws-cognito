import _ from "lodash";
import { Logger } from "log4ts";
import { aws_request } from "cordova-plugin-aws";

import { Cognito } from "./cognito";
import { CognitoClient, CognitoIdentity } from "./cognito_client";

const logger = new Logger("Cognito");

declare const AWS_COGNITO_POOL_ID;
declare const AWS_COGNITO_CUSTOM_PROVIDER;
const AWS_COGNITO_CUSTOM_PROVIDER_ID = JSON.parse(AWS_COGNITO_CUSTOM_PROVIDER).id;
const AWS_COGNITO_CUSTOM_PROVIDER_LAMBDA = JSON.parse(AWS_COGNITO_CUSTOM_PROVIDER).lambda;
const AWS = (window as any).AWS;

function getCredentials(): CognitoIdentityCredentials {
    return AWS.config.credentials;
}
interface CognitoIdentityCredentials {
    identityId: string;
    expired: boolean;
    get(callback: (err) => void): void;
    params: {
        IdentityId: string,
        Logins: { [key: string]: string; }
    };
}

export class CognitoWebClient extends CognitoClient {
    private static refreshing: Promise<CognitoIdentity> = null;

    constructor() {
        super();
        this.refresh();
    }

    get identity(): Promise<CognitoIdentity> {
        return CognitoWebClient.refreshing;
    }

    private async refresh(): Promise<CognitoIdentity> {
        const oldId = (_.isNil(CognitoWebClient.refreshing)) ? null : await CognitoWebClient.refreshing.catch((_) => null);

        return CognitoWebClient.refreshing = new Promise<CognitoIdentity>((resolve, reject) => {
            logger.info(() => `Refreshing cognito identity... (old = ${oldId})`);
            getCredentials().expired = true;
            getCredentials().get(async (err) => {
                if (err) {
                    logger.warn(() => `Cognito refresh error: ${err}`);
                    reject(err);
                } else {
                    logger.info(() => `Cognito refresh success`);
                    try {
                        const cred = getCredentials();
                        const newId: CognitoIdentity = {
                            identityId: cred.identityId,
                            services: _.keys(cred.params.Logins)
                        };
                        logger.debug(() => `Created CognitoIdentity: ${newId}`);
                        if (!_.isNil(oldId)) {
                            await Promise.all(Cognito.changedHooks.map(async (hook) => {
                                try {
                                    await hook(oldId.identityId, newId.identityId);
                                } catch (ex) {
                                    logger.warn(() => `Error on hook: ${ex}`);
                                }
                            }));
                            logger.info(() => `Done hooking of changing cognitoId`);
                        }
                        resolve(newId);
                    } catch (ex) {
                        logger.warn(() => `Failed to process changing CognitoIdentity: ${ex}`);
                        reject(ex);
                    }
                }
            });
        });
    }

    async setToken(service: string, token: string): Promise<CognitoIdentity> {
        logger.info(() => `SignIn: ${service}`);
        const current = await this.identity;
        if (_.includes(current.services, service)) {
            logger.info(() => `Nothing to do, since already signed in: ${service}`);
            return current;
        } else {
            const p = getCredentials().params;
            if (_.isEmpty(p.Logins)) {
                p.Logins = {};
                p.IdentityId = null;
            }
            p.Logins[service] = token;
            return await this.refresh();
        }
    }

    async removeToken(service: string): Promise<CognitoIdentity> {
        logger.info(() => `SignOut: ${service}`);
        const current = await this.identity;
        if (_.includes(current.services, service)) {
            const p = getCredentials().params;
            delete p.Logins[service];
            if (_.isEmpty(p.Logins)) p.IdentityId = null;
            return await this.refresh();
        } else {
            logger.info(() => `Nothing to do, since not signed in: ${service}`);
            return current;
        }
    }
    
    async setCustomToken(userId: string): Promise<CognitoIdentity> {
        const current = await this.identity;
        if (_.includes(current.services, AWS_COGNITO_CUSTOM_PROVIDER_ID)) {
            logger.info(() => `Nothing to do, since already signed in: ${AWS_COGNITO_CUSTOM_PROVIDER_ID}`);
            return current;
        }
        const res = await AuthServer.add(userId);

        const logins = _.clone(getCredentials().params.Logins || {});
        logins[AWS_COGNITO_CUSTOM_PROVIDER_ID] = res.Token;

        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: AWS_COGNITO_POOL_ID,
            IdentityId: res.IdentityId,
            Logins: logins
        });
        return {
            identityId: res.IdentityId,
            services: _.keys(logins)
        };
    }
    
    async removeCustomToken(userId: string): Promise<CognitoIdentity> {
        const current = await this.identity;
        if (!_.includes(current.services, AWS_COGNITO_CUSTOM_PROVIDER_ID)) {
            logger.info(() => `Nothing to do, since not signed in: ${AWS_COGNITO_CUSTOM_PROVIDER_ID}`);
            return current;
        }
        await AuthServer.remove(userId);
        return this.removeToken(AWS_COGNITO_CUSTOM_PROVIDER_ID);
    }
}

type ServerResult = {
    IdentityId: string,
    Token: string
}

type ServerRequest = {
    IdentityPoolId: string,
    IdentityId?: string,
    Logins: { [key: string]: string }
}

type LambdaRequest = {
    FunctionName: string,
    Payload: Object,
    ClientContext?: string, // Base64 encoded JSON
    InvocationType?: "Event" | "RequestResponse" | "DryRun",
    LogType?: "None" | "Tail",
    Qualifier?: string
}

class AuthServer {
    static async add(userId: string): Promise<ServerResult> {
        const p = getCredentials().params;
        const logins = _.clone(p.Logins || {});
        logins[AWS_COGNITO_CUSTOM_PROVIDER_ID] = userId;

        const params: ServerRequest = {
            IdentityPoolId: AWS_COGNITO_POOL_ID,
            Logins: logins
        }
        if (!_.isEmpty(p.Logins)) params.IdentityId = p.IdentityId;

        return this.invoke<ServerResult>(params);
    }

    static async remove(userId: string): Promise<void> {
        const p = getCredentials().params;

        await this.invoke({
            IdentityId: p.IdentityId,
            IdentityPoolId: AWS_COGNITO_POOL_ID,
            DeveloperProviderName: AWS_COGNITO_CUSTOM_PROVIDER_ID,
            DeveloperUserIdentifier: userId
        });
    }

    private static invoke<T>(payload): Promise<T> {
        const splited = AWS_COGNITO_CUSTOM_PROVIDER_LAMBDA.split(':');

        const params: LambdaRequest = {
            FunctionName: splited[0],
            Payload: payload
        };
        if (splited.length > 1) params.Qualifier = splited[1];

        const lambda = new AWS.Lambda();
        return aws_request<T>(lambda.invoke(params));
    }
}
