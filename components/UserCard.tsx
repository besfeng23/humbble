import { EvilIcons } from "@expo/vector-icons";
import React from "react";
import { ImageBackground, Pressable, Text, View } from "react-native";

interface UserCardProp {
  data: any;
  size?: "small" | "large";
  showLikeIcon?: boolean;
  onPress?: () => void;
}

const UserCard = ({
  data,
  size = "small",
  showLikeIcon = false,
  onPress,
}: UserCardProp) => {
  const isLarge = size === "large";
  const initial = data?.name ? data.name[0].toUpperCase() : "U";
  const age = data?.age ?? 24;

  const content = (
    <View
      style={{
        padding: 16,
        gap: isLarge ? 10 : 5,
        backgroundColor: "#ffffff",
        borderRadius: 12,
        elevation: 2,
      }}
    >
      <ImageBackground
        source={{ uri: data?.image }}
        style={{
          width: isLarge ? 240 : 180,
          height: isLarge ? 300 : 200,
          borderRadius: 10,
          overflow: "hidden",
        }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800" }}>
          {initial}, {age}
        </Text>
        {showLikeIcon && <EvilIcons name="heart" size={24} color="black" />}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Inspect profile ${initial}, ${age}`}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

export default UserCard;
