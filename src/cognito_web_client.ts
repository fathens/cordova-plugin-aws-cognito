import _ from "lodash";
import { Logger } from "log4ts";

import { Cognito } from "./cognito";
import { CognitoClient, CognitoIdentity } from "./cognito_client";

const logger = new Logger("Cognito");

declare const AWS_COGNITO_POOL_ID;
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
                        const newId = new CognitoIdentity(cred.identityId, cred.params.Logins);
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
        const p = getCredentials().params;
        if (_.has(p.Logins, service)) {
            logger.info(() => `Nothing to do, since already signed in: ${service}`);
        } else {
            if (_.isEmpty(p.Logins)) p.Logins = {};
            p.Logins[service] = token;
            p.IdentityId = null;
            return await this.refresh();
        }
    }

    async removeToken(service: string): Promise<CognitoIdentity> {
        logger.info(() => `SignOut: ${service}`);
        const p = getCredentials().params;
        if (_.has(p.Logins, service)) {
            delete p.Logins[service];
            p.IdentityId = null;
            return await this.refresh();
        } else {
            logger.info(() => `Nothing to do, since not signed in: ${service}`);
        }
    }
}
