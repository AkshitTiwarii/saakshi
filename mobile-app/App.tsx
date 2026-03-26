import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeEntryScreen } from "./src/screens/SafeEntryScreen";
import { EmotionalCheckInScreen } from "./src/screens/EmotionalCheckInScreen";
import { CaptureMethodScreen } from "./src/screens/CaptureMethodScreen";
import { QuickExitScreen } from "./src/screens/QuickExitScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CaptureWriteScreen } from "./src/screens/CaptureWriteScreen";
import { CaptureVoiceScreen } from "./src/screens/CaptureVoiceScreen";
import { CaptureDrawScreen } from "./src/screens/CaptureDrawScreen";
import { CaptureUploadScreen } from "./src/screens/CaptureUploadScreen";
import { KhojakScreen } from "./src/screens/KhojakScreen";
import { WarRoomScreen } from "./src/screens/WarRoomScreen";
import { PareekshaScreen } from "./src/screens/PareekshaScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { DocsScreen } from "./src/screens/DocsScreen";
import { WorkspaceWebScreen } from "./src/screens/WorkspaceWebScreen";

export type RootStackParamList = {
  SafeEntry: undefined;
  EmotionalCheckIn: undefined;
  CaptureMethod: { mood?: string } | undefined;
  Dashboard: undefined;
  CaptureWrite: { mood?: string } | undefined;
  CaptureVoice: { mood?: string } | undefined;
  CaptureDraw: { mood?: string } | undefined;
  CaptureUpload: { mood?: string } | undefined;
  Khojak: undefined;
  WarRoom: undefined;
  Pareeksha: undefined;
  Settings: undefined;
  Docs: undefined;
  WebWorkspace: undefined;
  QuickExit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Dashboard"
        screenOptions={{ headerShown: false, animation: "fade" }}
      >
        <Stack.Screen name="SafeEntry" component={SafeEntryScreen} />
        <Stack.Screen name="EmotionalCheckIn" component={EmotionalCheckInScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="CaptureMethod" component={CaptureMethodScreen} />
        <Stack.Screen name="CaptureWrite" component={CaptureWriteScreen} />
        <Stack.Screen name="CaptureVoice" component={CaptureVoiceScreen} />
        <Stack.Screen name="CaptureDraw" component={CaptureDrawScreen} />
        <Stack.Screen name="CaptureUpload" component={CaptureUploadScreen} />
        <Stack.Screen name="Khojak" component={KhojakScreen} />
        <Stack.Screen name="WarRoom" component={WarRoomScreen} />
        <Stack.Screen name="Pareeksha" component={PareekshaScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Docs" component={DocsScreen} />
        <Stack.Screen name="WebWorkspace" component={WorkspaceWebScreen} />
        <Stack.Screen name="QuickExit" component={QuickExitScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
