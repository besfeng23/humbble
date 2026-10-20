import { Image, View } from "react-native";

type AvatarProps = {
  size: number;
  image?: string;
};

const Avatar = ({ size }: AvatarProps) => {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: "100%",
        overflow: "hidden",
        borderWidth: 3,
      }}
    >
      <Image
        style={{ width: "100%", height: "100%" }}
        source={{
          uri: "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
        }}
      />
    </View>
  );
};
export default Avatar;
