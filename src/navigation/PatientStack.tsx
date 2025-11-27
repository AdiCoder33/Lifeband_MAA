import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PatientHomePlaceholder from '../screens/placeholders/PatientHomePlaceholder';
import { PatientStackParamList } from '../types/navigation';
import { UserProfile } from '../types/user';

type Props = {
  profile?: UserProfile | null;
};

const Stack = createNativeStackNavigator<PatientStackParamList>();

const PatientStack: React.FC<Props> = ({ profile }) => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="PatientHome"
        options={{ title: 'LifeBand MAA' }}
      >
        {(screenProps) => <PatientHomePlaceholder {...screenProps} profile={profile} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

export default PatientStack;
