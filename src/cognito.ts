import _ from 'lodash';
import { CognitoClient, CognitoIdentity, ChangedCognitoIdHook } from "./cognito_client";
import { CognitoWebClient } from "./cognito_web_client";

const plugin = (window as any).plugin;

function isDef(typedec) {
    return !_.isEqual(typedec, 'undefined');
}
const hasPlugin = isDef(typeof plugin) && isDef(typeof plugin.AWS) && isDef(typeof plugin.AWS.Cognito);

export class Cognito extends CognitoClient {
    static addChangingHook(hook: ChangedCognitoIdHook) {
        this.changedHooks.push(hook);
    }
    
    constructor() {
        super();
        this.client = hasPlugin ? plugin.AWS.Cognito : new CognitoWebClient();
    }
    
    private client: CognitoClient;
    
    get identity(): Promise<CognitoIdentity> {
        return this.client.identity;
    }
    
    setToken(service: string, token: string): Promise<CognitoIdentity> {
        return this.client.setToken(service, token);
    }
    
    removeToken(service: string): Promise<CognitoIdentity> {
        return this.client.removeToken(service);
    }
}
