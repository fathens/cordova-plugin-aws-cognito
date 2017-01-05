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
            self.withLogins({ provider in
                let logins = provider.logins
                provider.logins = logins
                self.success()
            })
        }
    }
    
    func removeToken(_ command: CDVInvokedUrlCommand) {
        fork(command) {
            let service = self.getString(0)
            self.success()
        }
    }

    // MARK: - Private Impl
    
    private func success() {
        withLogins({ provider in
            if let id = provider.identityId {
                self.finish_ok([
                    "identityId": id,
                    "services": provider.logins.keys
                ])
            } else {
                self.finish_error("No IdentityId yet.")
            }
        })
    }
    
    private func withLogins(_ callback: @escaping ((_ provider: AWSCognitoCredentialsProvider) -> Void)) {
        if let cognito = AWSServiceManager.default().defaultServiceConfiguration.credentialsProvider as? AWSCognitoCredentialsProvider {
            callback(cognito)
        } else {
            self.finish_error("No Cognito Identity Provider")
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

    // MARK: - Private Utillities

    private var currentCommand: CDVInvokedUrlCommand?
    
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
