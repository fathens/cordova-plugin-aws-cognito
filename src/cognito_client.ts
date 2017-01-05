import _ from "lodash";

export type ChangedCognitoIdHook = (oldId: string, newId: string) => Promise<void>;

export abstract class CognitoClient {
    protected static changedHooks: Array<ChangedCognitoIdHook> = new Array();

    abstract identity: Promise<CognitoIdentity>;
    abstract setToken(service: string, token: string): Promise<CognitoIdentity>;
    abstract removeToken(service: string): Promise<CognitoIdentity>;
}


export class CognitoIdentity {
    constructor(private id: string, logins: { [key: string]: string; }) {
        this.services = _.keys(logins);
    }
    
    private services: string[];

    toString(): string {
        return `Cognito(identityId: ${this.id}, services: [${this.services.join(", ")}])`;
    }

    get identityId(): string {
        return this.id;
    }

    isJoin(name: string): boolean {
        return _.includes(this.services, name);
    }
}
