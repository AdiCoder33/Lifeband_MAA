import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DoctorHomePlaceholder from '../screens/placeholders/DoctorHomePlaceholder';
import { DoctorStackParamList } from '../types/navigation';
import { UserProfile } from '../types/user';

type Props = {
  profile?: UserProfile | null;
};

const Stack = createNativeStackNavigator<DoctorStackParamList>();

const DoctorStack: React.FC<Props> = ({ profile }) => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="DoctorHome"
        options={{ title: 'LifeBand MAA' }}
      >
        {(screenProps) => <DoctorHomePlaceholder {...screenProps} profile={profile} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

export default DoctorStack;
