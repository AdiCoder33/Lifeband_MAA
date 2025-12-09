import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import DoctorQrScreen from '../screens/doctor/DoctorQrScreen';
import DoctorPatientsScreen from '../screens/doctor/DoctorPatientsScreen';
import DoctorPatientDetailScreen from '../screens/doctor/DoctorPatientDetailScreen';
import DoctorAppointmentsScreen from '../screens/doctor/DoctorAppointmentsScreen';
import DoctorAppointmentDetailScreen from '../screens/doctor/DoctorAppointmentDetailScreen';
import DoctorCreateAppointmentScreen from '../screens/doctor/DoctorCreateAppointmentScreen';
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
        {(screenProps) => <DoctorDashboardScreen {...screenProps} profile={profile} />}
      </Stack.Screen>
      <Stack.Screen name="DoctorQR">
        {(props) => <DoctorQrScreen {...props} profile={profile} />}
      </Stack.Screen>
      <Stack.Screen name="DoctorPatients" component={DoctorPatientsScreen} options={{ title: 'Patients' }} />
      <Stack.Screen name="DoctorPatientDetail" component={DoctorPatientDetailScreen} options={{ title: 'Patient Details' }} />
      <Stack.Screen name="DoctorAppointments" component={DoctorAppointmentsScreen} options={{ title: 'Appointments' }} />
      <Stack.Screen name="DoctorAppointmentDetail" component={DoctorAppointmentDetailScreen} options={{ title: 'Appointment' }} />
      <Stack.Screen name="DoctorCreateAppointment" component={DoctorCreateAppointmentScreen} options={{ title: 'New Appointment' }} />
    </Stack.Navigator>
  );
};

export default DoctorStack;
