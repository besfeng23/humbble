import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface HeaderProp {
  headerTitle: React.ReactNode;
  button?: (() => React.ReactNode) | React.ReactNode;
}

const Header = ({ headerTitle, button }: HeaderProp) => {
  return (
    <View style={styles.headerSection}>
      <Text accessibilityRole="header" style={styles.logo}>
        {headerTitle}
      </Text>
      {typeof button === "function" ? button() : button}
    </View>
  );
};

export default Header;

const styles = StyleSheet.create({
  headerSection: {
    justifyContent: "space-between",
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 8,
    marginBottom: 6,
  },
  logo: {
    color: "#11181C",
    fontSize: 24,
    fontWeight: "bold",
    letterSpacing: 1,
  },
});
