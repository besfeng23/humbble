import {
  StyleSheet,
  Image,
  Platform,
  View,
  Text,
  FlatList,
  ImageBackground,
  ScrollView,
} from "react-native";

import { Collapsible } from "@/components/Collapsible";
import { ExternalLink } from "@/components/ExternalLink";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import Header from "@/components/Header";
import { EvilIcons, Octicons } from "@expo/vector-icons";
import { matchwithgoalData, RECOMMENDATION_USER } from "@/DB/userDB";
import UserCard from "@/components/UserCard";

export default function Discover() {
  const button = () => <EvilIcons name="question" size={24} color="black" />;
  const GoalSection = (backgroundColor: string) => {
    return (
      <View style={{ gap: 5, paddingVertical: 15 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>
          Same dating goal
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={matchwithgoalData}
            renderItem={({ item }) => (
              <UserCard showLikeIcon={true} data={item} size="small" />
            )}
            keyExtractor={(item) => item?.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }}></View>}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };
  const CommonCommuity = (backgroundColor: string) => {
    return (
      <View
        style={{
          gap: 5,
          backgroundColor: backgroundColor,
          paddingVertical: 15,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>
          Communities in common
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={matchwithgoalData}
            renderItem={({ item }) => (
              <UserCard showLikeIcon={true} data={item} size="small" />
            )}
            keyExtractor={(item) => item.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }}></View>}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };
  const SimilarInterest = (backgroundColor: string) => {
    return (
      <View
        style={{
          gap: 5,
          backgroundColor: backgroundColor,
          paddingVertical: 15,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>
          Similar interests
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={matchwithgoalData}
            renderItem={({ item }) => (
              <UserCard showLikeIcon={true} data={item} size="small" />
            )}
            keyExtractor={(item) => item.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }}></View>}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };
  const Recommendataions = (backgroundColor: string) => {
    return (
      <View
        style={{
          gap: 5,
          backgroundColor: backgroundColor,
          paddingVertical: 15,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "bold" }}>
          Recommendations for you
        </Text>
        <View style={{ width: "100%", padding: 2 }}>
          <FlatList
            horizontal={true}
            data={RECOMMENDATION_USER}
            renderItem={({ item }) => (
              <UserCard showLikeIcon={true} size="large" data={item} />
            )}
            keyExtractor={(item) => item.id.toString()}
            ItemSeparatorComponent={() => <View style={{ width: 10 }}></View>}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </View>
    );
  };
  return (
    <ScrollView style={{ paddingHorizontal: 8 }}>
      <Header headerTitle={"Discover"} button={button} />
      <View
        style={{
          backgroundColor: "#ffa600",
          width: 200,
          borderRadius: 20,
          paddingHorizontal: 4,
          paddingVertical: 6,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text style={{ fontWeight: "400" }}>See new people in 15 hours</Text>
      </View>
      <Text style={{ fontWeight: "300" }}>
        Connect over common group with people who match your vibe, refreshed
        every day.
      </Text>
      {Recommendataions("#fffff")}
      {GoalSection("#fffff")}
      {CommonCommuity("#e0dede")}
      {SimilarInterest("fffff")}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: "#808080",
    bottom: -90,
    left: -35,
    position: "absolute",
  },
  titleContainer: {
    flexDirection: "row",
    gap: 8,
  },
});
