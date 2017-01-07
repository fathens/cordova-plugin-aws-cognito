import _ from "lodash";

export type ChangedCognitoIdHook = (oldId: string, newId: string) => Promise<void>;

export abstract class CognitoClient {
    protected static changedHooks: Array<ChangedCognitoIdHook> = new Array();

    abstract identity: Promise<CognitoIdentity>;
    abstract setToken(service: string, token: string): Promise<CognitoIdentity>;
    abstract removeToken(service: string): Promise<CognitoIdentity>;
    abstract setCustomToken(userId: string): Promise<CognitoIdentity>;
    abstract removeCustomToken(userId: string): Promise<CognitoIdentity>;
}

export type CognitoIdentity = {
    identityId: string,
    services: string[]
}
