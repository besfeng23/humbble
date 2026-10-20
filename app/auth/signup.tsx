import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
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

const SignupScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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

  const handleSignup = async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    if (!isSupabaseConfigured) {
      setErrorMessage("Auth is not configured");
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      setErrorMessage("All fields are required.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const emailRedirectTo =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}/auth/signin`
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { full_name: trimmedName },
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });

      if (error) {
        setErrorMessage(error.message || "Sign up failed.");
        return;
      }

      if (data.session) {
        router.replace("/(tabs)/people");
        return;
      }

      if (data.user && !data.session) {
        setInfoMessage(
          "Check your email to confirm your account, then sign in."
        );
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      testID="scr-04-signup"
      heroTitle="Join Us Today"
      heroSubtitle="Create your 18+ account and start exploring"
      formTitle="SIGN UP"
      backgroundSource={require("../../assets/images/sign-up.jpg")}
      fallbackHref="/auth/signin"
      backLabel="Sign In"
    >
      {errorMessage ? (
        <FailureState
          testID="signup-error-state"
          title="Registration notice"
          message={errorMessage}
          compact
          style={styles.stateBanner}
        />
      ) : null}

      {infoMessage ? (
        <SuccessState
          testID="signup-info-state"
          title="Account created"
          message={infoMessage}
          compact
          style={styles.stateBanner}
        />
      ) : null}

      {loading ? (
        <PendingState
          testID="signup-pending-state"
          title="Creating account..."
          message="Setting up your profile."
          compact
          style={styles.stateBanner}
        />
      ) : null}

      <View style={styles.inputContainer}>
        <TextInput
          testID="signup-name-input"
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#5C646A"
          accessibilityLabel="Full Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          testID="signup-email-input"
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
          testID="signup-password-input"
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#5C646A"
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onSubmitEditing={handleSignup}
        />
      </View>

      <TouchableOpacity
        testID="signup-submit-btn"
        accessibilityRole="button"
        accessibilityLabel={loading ? "Creating account" : "Sign Up"}
        accessibilityState={{ disabled: loading, busy: loading }}
        style={[styles.signupButton, loading && styles.signupButtonDisabled]}
        onPress={handleSignup}
        disabled={loading}
      >
        <View style={styles.signupButtonSolid}>
          <Text style={styles.signupButtonTextSolid}>
            {loading ? "Creating account..." : "Sign Up"}
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
          testID="signup-google-disabled"
          style={[styles.socialButton, styles.socialButtonDisabled]}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Google sign-up unavailable"
          accessibilityState={{ disabled: true }}
        >
          <Text style={styles.socialButtonText}>G</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="signup-facebook-disabled"
          style={[styles.socialButton, styles.socialButtonDisabled]}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Facebook sign-up unavailable"
          accessibilityState={{ disabled: true }}
        >
          <Text style={styles.socialButtonText}>f</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        testID="signup-to-signin-link"
        accessibilityRole="link"
        accessibilityLabel="Already have an account? Sign In"
        onPress={() => router.replace("/auth/signin")}
        style={styles.linkContainer}
      >
        <Text style={styles.linkText}>
          Already have an account?{" "}
          <Text style={styles.linkHighlight}>Sign In</Text>
        </Text>
      </TouchableOpacity>

      <View style={styles.termsContainer}>
        <Text style={styles.termsText}>
          By signing up, you confirm you are 18+ and agree to our{" "}
        </Text>
        <View style={styles.termsLinksRow}>
          <TouchableOpacity
            testID="signup-terms-link"
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
            onPress={() =>
              router.push("/(public)/legal/terms-of-service" as any)
            }
            style={styles.termsLinkButton}
          >
            <Text style={styles.termsLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.termsText}> and </Text>
          <TouchableOpacity
            testID="signup-privacy-link"
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            onPress={() =>
              router.push("/(public)/legal/privacy-notice" as any)
            }
            style={styles.termsLinkButton}
          >
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  signupButton: {
    borderRadius: 12,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    marginBottom: 20,
  },
  signupButtonDisabled: {
    elevation: 0,
    shadowOpacity: 0,
  },
  signupButtonSolid: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFD600",
    borderRadius: 12,
  },
  signupButtonTextSolid: {
    color: "#1A1A1A",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
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
    marginBottom: 20,
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
    marginBottom: 16,
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
  termsContainer: {
    paddingHorizontal: 10,
    alignItems: "center",
  },
  termsLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  termsText: {
    fontSize: 12,
    color: "#525860",
    textAlign: "center",
    lineHeight: 18,
  },
  termsLinkButton: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  termsLink: {
    color: "#1A1A1A",
    fontWeight: "700",
    textDecorationLine: "underline",
    fontSize: 12,
  },
});

export default SignupScreen;
