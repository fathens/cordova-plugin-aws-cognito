package org.fathens.cordova.plugin.aws

import android.content.pm.PackageManager.GET_META_DATA
import android.os.Bundle
import com.amazonaws.auth.CognitoCachingCredentialsProvider
import com.amazonaws.regions.Regions
import org.apache.cordova.CallbackContext
import org.apache.cordova.CordovaPlugin
import org.apache.cordova.PluginResult
import org.json.JSONArray
import org.json.JSONObject

public class AwsCognito : CordovaPlugin() {
    private class PluginContext(val holder: AwsCognito, val action: String, val callback: CallbackContext) {
        fun error(msg: String?) = callback.error(msg)
        fun success(msg: String? = null) = callback.success(msg)
        fun success(v: Boolean) = callback.sendPluginResult(PluginResult(PluginResult.Status.OK, v))
        fun success(m: Map<*, *>) = callback.success(JSONObject(m))
        fun success(list: List<*>) = callback.success(JSONArray(list))
    }

    private var context: PluginContext? = null

    private val metaData: Bundle by lazy {
        cordova.activity.packageManager.getApplicationInfo(cordova.activity.packageName, GET_META_DATA).metaData
    }

    private val customProviderId: String by lazy {
        metaData.getString("org.fathens.aws.cognito.customProvider")
    }

    private val credentialProvider: CognitoCachingCredentialsProvider by lazy {
        CognitoCachingCredentialsProvider(
                cordova.activity.applicationContext,
                metaData.getString("org.fathens.aws.cognito.identityPool"),
                Regions.fromName(metaData.getString("org.fathens.aws.region")))
    }

    override fun execute(action: String, args: JSONArray, callbackContext: CallbackContext): Boolean {
        try {
            val method = javaClass.getMethod(action, args.javaClass)
            if (method != null) {
                cordova.threadPool.execute {
                    context = PluginContext(this, action, callbackContext)
                    try {
                        method.invoke(this, args)
                    } catch (ex: Exception) {
                        context?.error(ex.message)
                    }
                }
                return true
            } else {
                return false
            }
        } catch (e: NoSuchMethodException) {
            return false
        }
    }

    // plugin commands

    fun getIdentity(args: JSONArray) {
        success()
    }

    fun setToken(args: JSONArray) {
        val service = args.getString(0)
        val token = args.getString(1)

        val logins = credentialProvider.logins
        if (!logins.containsKey(service)) {
            logins.put(service, token)
            credentialProvider.logins = logins
            credentialProvider.refresh()
        }
        success()
    }

    fun removeToken(args: JSONArray) {
        val service = args.getString(0)

        val logins = credentialProvider.logins
        if (logins.containsKey(service)) {
            logins.remove(service)
            credentialProvider.logins = logins
            credentialProvider.refresh()
        }
        success()
    }

    // private Impl

    fun success() {
        context?.success(mapOf(
                "identityId" to credentialProvider.identityId,
                "services" to credentialProvider.logins.keys.toList()
        ))
    }
}
