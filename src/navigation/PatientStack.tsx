import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PatientDashboardScreen from '../screens/patient/PatientDashboardScreen';
import LifeBandScreen from '../screens/patient/LifeBandScreen';
import VitalsHistoryScreen from '../screens/patient/VitalsHistoryScreen';
import LinkDoctorScreen from '../screens/patient/LinkDoctorScreen';
import PatientAppointmentsScreen from '../screens/patient/PatientAppointmentsScreen';
import PatientAppointmentDetailScreen from '../screens/patient/PatientAppointmentDetailScreen';
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
        {(screenProps) => <PatientDashboardScreen {...screenProps} profile={profile} />}
      </Stack.Screen>
      <Stack.Screen name="LifeBand" component={LifeBandScreen} options={{ title: 'LifeBand' }} />
      <Stack.Screen name="VitalsHistory" component={VitalsHistoryScreen} options={{ title: 'Vitals History' }} />
      <Stack.Screen name="LinkDoctor" component={LinkDoctorScreen} options={{ title: 'Link Doctor' }} />
      <Stack.Screen name="PatientAppointments" component={PatientAppointmentsScreen} options={{ title: 'Appointments' }} />
      <Stack.Screen
        name="PatientAppointmentDetail"
        component={PatientAppointmentDetailScreen}
        options={{ title: 'Appointment' }}
      />
    </Stack.Navigator>
  );
};

export default PatientStack;
