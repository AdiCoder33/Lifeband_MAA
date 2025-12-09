import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text } from 'react-native';
import PatientDashboardScreen from '../screens/patient/PatientDashboardScreen';
import LifeBandScreen from '../screens/patient/LifeBandScreen';
import VitalsHistoryScreen from '../screens/patient/VitalsHistoryScreen';
import LinkDoctorScreen from '../screens/patient/LinkDoctorScreen';
import PatientAppointmentsScreen from '../screens/patient/PatientAppointmentsScreen';
import PatientAppointmentDetailScreen from '../screens/patient/PatientAppointmentDetailScreen';
import AppointmentsCalendarScreen from '../screens/patient/AppointmentsCalendarScreen';
import MeditronChatScreen from '../screens/patient/MeditronChatScreen';
import { PatientStackParamList } from '../types/navigation';
import { UserProfile } from '../types/user';

type Props = {
  profile?: UserProfile | null;
};

const Stack = createNativeStackNavigator<PatientStackParamList>();

const PatientStack: React.FC<Props> = ({ profile }) => {
  const [showGraphs, setShowGraphs] = React.useState(false);

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="PatientHome"
        options={{ 
          title: 'LifeBand Maa',
          headerTitleAlign: 'left',
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '700',
          }
        }}
      >
        {(screenProps) => <PatientDashboardScreen {...screenProps} profile={profile} />}
      </Stack.Screen>
      <Stack.Screen name="LifeBand" component={LifeBandScreen} options={{ title: 'LifeBand' }} />
      <Stack.Screen 
        name="VitalsHistory" 
        options={{
          title: 'Vitals History',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setShowGraphs(!showGraphs)}
              style={{
                backgroundColor: showGraphs ? '#283593' : '#E0E0E0',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                marginRight: 8,
              }}
            >
              <Text style={{ color: showGraphs ? '#FFFFFF' : '#616161', fontSize: 20 }}>
                {showGraphs ? '📋' : '📈'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      >
        {(screenProps) => <VitalsHistoryScreen {...screenProps} showGraphs={showGraphs} />}
      </Stack.Screen>
      <Stack.Screen name="LinkDoctor" component={LinkDoctorScreen} options={{ title: 'Link Doctor' }} />
      <Stack.Screen name="PatientAppointments" component={PatientAppointmentsScreen} options={{ title: 'Appointments' }} />
      <Stack.Screen
        name="PatientAppointmentDetail"
        component={PatientAppointmentDetailScreen}
        options={{ title: 'Appointment' }}
      />
      <Stack.Screen name="AppointmentsCalendar" component={AppointmentsCalendarScreen} options={{ title: 'Calendar' }} />
      <Stack.Screen name="MeditronChat" component={MeditronChatScreen} options={{ title: 'Ask Meditron' }} />
    </Stack.Navigator>
  );
};

export default PatientStack;
