/**
 * @format
 */

// Supabase's realtime client reaches for URL APIs that React Native doesn't ship
// fully — this polyfill fills them in. Must run before @supabase/supabase-js loads.
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
