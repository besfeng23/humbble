import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { AuthLayout } from "@/components/layout";
import { FailureState, PendingState, SuccessState } from "@/components/state";
import { useAuth } from "@/lib/AuthProvider";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const SigninScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    isSupabaseConfigured ? null : "Auth is not configured"
  );
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const router = useRouter();
  const { session } = useAuth();

  if (session) {
    return <Redirect href="/(tabs)/people" />;
  }

  const handleSignin = async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    if (!isSupabaseConfigured) {
      setErrorMessage("Auth is not configured");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Sign in failed.");
        return;
      }

      if (data.session) {
        setEmail("");
        setPassword("");
        router.replace("/(tabs)/people");
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      testID="scr-05-signin"
      heroTitle="Welcome Back"
      heroSubtitle="Sign in to continue your journey"
      formTitle="LOGIN"
      backgroundSource={require("../../assets/images/sign-in.jpg")}
      fallbackHref="/(public)"
    >
      {errorMessage ? (
        <FailureState
          testID="signin-error-state"
          title="Sign in notice"
          message={errorMessage}
          compact
          style={styles.stateBanner}
        />
      ) : null}

      {infoMessage ? (
        <SuccessState
          testID="signin-info-state"
          title="Notice"
          message={infoMessage}
          compact
          style={styles.stateBanner}
        />
      ) : null}

      {loading ? (
        <PendingState
          testID="signin-pending-state"
          title="Signing in..."
          message="Verifying your credentials."
          compact
          style={styles.stateBanner}
        />
      ) : null}

      <View style={styles.inputContainer}>
        <TextInput
          testID="signin-email-input"
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#5C646A"
          accessibilityLabel="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          testID="signin-password-input"
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#5C646A"
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onSubmitEditing={handleSignin}
        />
      </View>

      <TouchableOpacity
        testID="signin-forgot-password-btn"
        accessibilityRole="link"
        accessibilityLabel="Forgot Password? Reset your password"
        style={styles.forgotPassword}
        onPress={() => {
          setErrorMessage(null);
          router.push("/auth/recovery" as any);
        }}
      >
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>

      <TouchableOpacity
        testID="signin-submit-btn"
        accessibilityRole="button"
        accessibilityLabel={loading ? "Signing In" : "Login"}
        accessibilityState={{ disabled: loading, busy: loading }}
        style={[styles.loginButton, loading && styles.loginButtonDisabled]}
        onPress={handleSignin}
        disabled={loading}
      >
        <View style={styles.loginButtonSolid}>
          <Text style={styles.loginButtonTextSolid}>
            {loading ? "Signing In..." : "Login"}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>
          Social OAuth (disabled until provider setup)
        </Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.socialContainer}>
        <TouchableOpacity
          testID="signin-google-disabled"
          style={[styles.socialButton, styles.socialButtonDisabled]}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Google sign-in unavailable"
          accessibilityState={{ disabled: true }}
        >
          <Text style={styles.socialButtonText}>G</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="signin-facebook-disabled"
          style={[styles.socialButton, styles.socialButtonDisabled]}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Facebook sign-in unavailable"
          accessibilityState={{ disabled: true }}
        >
          <Text style={styles.socialButtonText}>f</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        testID="signin-to-signup-link"
        accessibilityRole="link"
        accessibilityLabel="Don't have an account? Sign Up"
        onPress={() => router.replace("/auth/signup")}
        style={styles.linkContainer}
      >
        <Text style={styles.linkText}>
          Don't have an account?{" "}
          <Text style={styles.linkHighlight}>Sign Up</Text>
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  stateBanner: {
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#11181C",
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 24,
    minHeight: 44,
    justifyContent: "center",
  },
  forgotPasswordText: {
    color: "#1A1A1A",
    textDecorationLine: "underline",
    fontSize: 14,
    fontWeight: "600",
  },
  loginButton: {
    borderRadius: 12,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  loginButtonDisabled: {
    elevation: 0,
    shadowOpacity: 0,
  },
  loginButtonSolid: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFD600",
    borderRadius: 12,
  },
  loginButtonTextSolid: {
    color: "#1A1A1A",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#e9ecef",
  },
  dividerText: {
    marginHorizontal: 12,
    color: "#525860",
    fontSize: 12,
  },
  socialContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginBottom: 24,
  },
  socialButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFD600",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  socialButtonDisabled: {
    backgroundColor: "#E9ECEF",
    borderColor: "#9BA1A6",
    opacity: 0.65,
  },
  socialButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#525860",
  },
  linkContainer: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  linkText: {
    color: "#525860",
    fontSize: 16,
  },
  linkHighlight: {
    color: "#1A1A1A",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});

export default SigninScreen;
