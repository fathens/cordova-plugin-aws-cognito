import Foundation
import Cordova
import AWSCore

fileprivate func log(_ msg: String) {
    print(msg)
}

@objc(AwsCognito)
class AwsCognito: CDVPlugin {
    // MARK: - Plugin Commands

    func getIdentity(_ command: CDVInvokedUrlCommand) {
        fork(command) {
            self.success()
        }
    }
    
    func setToken(_ command: CDVInvokedUrlCommand) {
        fork(command) {
            let service = self.getString(0)
            let token = self.getString(1)
            self.withLogins { provider, logins in
                if logins.keys.contains(service) {
                    log("No need to add '\(service)', already contains")
                } else {
                    var tokens = logins
                    tokens[service] = token
                    self.updateLogins(tokens)
                }
                self.success()
            }
        }
    }
    
    func removeToken(_ command: CDVInvokedUrlCommand) {
        fork(command) {
            let service = self.getString(0)
            self.withLogins { provider, logins in
                if logins.keys.contains(service) {
                    var tokens = logins
                    tokens.removeValue(forKey: service)
                    self.updateLogins(tokens)
                } else {
                    log("No need to remove '\(service)', not contains")
                }
                self.success()
            }
        }
    }
    
    // MARK: - Private Utillities

    private func success() {
        withLogins { provider, logins in
            if let id = provider.identityId {
                self.finish_ok([
                    "identityId": id,
                    "services": Array(logins.keys)
                ])
            } else {
                self.finish_error("No IdentityId yet.")
            }
        }
    }
    
    private func withTask<T>(_ task: AWSTask<T>, _ callback: ((_ res: T) -> Void)? = nil) {
        task.continue({ task in
            if let error = task.error {
                self.finish_error(error.localizedDescription)
            } else {
                if let callback = callback {
                    if let result = task.result {
                        callback(result)
                    } else {
                        self.finish_error("No result")
                    }
                } else {
                    self.finish_ok()
                }
            }
            return nil
        })
    }
    
    private var currentCommand: CDVInvokedUrlCommand?
    
    private func withLogins(_ callback: @escaping ((_ provider: AWSCognitoCredentialsProviderHelperProtocol, _ logins: [String : String]) -> Void)) {
        if let cognito = AWSServiceManager.default().defaultServiceConfiguration.credentialsProvider as? AWSCognitoCredentialsProvider {
            let provider = cognito.identityProvider
            withTask(provider.logins()) { logins in
                let tokens = NSDictionary(dictionary: logins)
                callback(provider, tokens as! [String : String])
            }
        } else {
            self.finish_error("No Cognito Identity Provider")
        }
    }
    
    lazy private var infoDict: [String : String]? = Bundle.main.infoDictionary?["CordovaAWS"] as? [String : String]
    
    private func updateLogins(_ tokens: [String : String]) {
        let manager = LoginsIdentityProvider(tokens)
        if let regionName = self.infoDict?["Region"], let poolId = self.infoDict?["CognitoPool"] {
            let region = regionName.aws_regionTypeValue()
            let provider = AWSCognitoCredentialsProvider.init(regionType: region, identityPoolId: poolId, identityProviderManager: manager)
            let config = AWSServiceConfiguration.init(region: region, credentialsProvider: provider)
            AWSServiceManager.default().defaultServiceConfiguration = config
            log("AWSServiceManager is changed: logins=\(manager.tokens)")
        } else {
            self.finish_error("Not configured: Region and CognitoPool")
        }
    }

    private func getString(_ index: UInt) -> String {
        return currentCommand!.argument(at: index) as! String
    }

    private func fork(_ command: CDVInvokedUrlCommand, _ proc: @escaping () throws -> Void) {
        DispatchQueue.global(qos: DispatchQoS.QoSClass.utility).async(execute: {
            self.currentCommand = command
            defer {
                self.currentCommand = nil
            }
            do {
                try proc()
            } catch (let ex) {
                self.finish_error(ex.localizedDescription)
            }
        })
    }

    private func finish_error(_ msg: String!) {
        if let command = self.currentCommand {
            commandDelegate!.send(CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: msg), callbackId: command.callbackId)
        }
    }

    private func finish_ok(_ result: Any? = nil) {
        if let command = self.currentCommand {
            log("Command Result: \(result)")
            if let msg = result as? String {
                commandDelegate!.send(CDVPluginResult(status: CDVCommandStatus_OK, messageAs: msg), callbackId: command.callbackId)
            } else if let b = result as? Bool {
                commandDelegate!.send(CDVPluginResult(status: CDVCommandStatus_OK, messageAs: b), callbackId: command.callbackId)
            } else if let array = result as? [Any] {
                commandDelegate!.send(CDVPluginResult(status: CDVCommandStatus_OK, messageAs: array), callbackId: command.callbackId)
            } else if let dict = result as? [String: AnyObject] {
                commandDelegate!.send(CDVPluginResult(status: CDVCommandStatus_OK, messageAs: dict), callbackId: command.callbackId)
            } else {
                commandDelegate!.send(CDVPluginResult(status: CDVCommandStatus_OK), callbackId: command.callbackId)
            }
        }
    }
}

fileprivate class LoginsIdentityProvider: NSObject, AWSIdentityProviderManager {
    var tokens : [String : String] = [:]
    init(_ tokens: [String : String]) {
        self.tokens = tokens
    }
    @objc func logins() -> AWSTask<NSDictionary> {
        return AWSTask(result: NSDictionary(dictionary: tokens))
    }
}

