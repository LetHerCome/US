package com.usapp.googlesignin;

import android.app.Activity;
import android.os.CancellationSignal;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * «Accedi con Google» (Android Credential Manager). Returns only the Google ID
 * token, bound to the hashed nonce the app created; google-auth.js hands it to
 * Supabase signInWithIdToken with the raw nonce. Nothing is stored here.
 */
@CapacitorPlugin(name = "UsGoogleSignIn")
public class UsGoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("serverClientId", "");
        String nonce = call.getString("nonce", "");
        if (!UsGoogleSignInPolicy.validClientId(clientId) || !UsGoogleSignInPolicy.validNonce(nonce)) {
            call.reject("invalid_request", "invalid_request");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("unavailable", "unavailable");
            return;
        }
        // The button flow: always the account chooser, «Aggiungi account» included.
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager.create(activity).getCredentialAsync(
            activity,
            request,
            new CancellationSignal(),
            activity::runOnUiThread,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (!(credential instanceof CustomCredential)
                        || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.reject("unexpected_credential", "unexpected_credential");
                        return;
                    }
                    try {
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                        JSObject result = new JSObject();
                        result.put("idToken", google.getIdToken());
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("unexpected_credential", "unexpected_credential");
                    }
                }

                @Override
                public void onError(GetCredentialException error) {
                    String code = UsGoogleSignInPolicy.errorCode(error.getType());
                    call.reject(code, code);
                }
            }
        );
    }
}
