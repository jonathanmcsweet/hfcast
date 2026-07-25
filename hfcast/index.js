import { registerRootComponent } from 'expo';
import App from './App';

/**
 * Explicit entry point rather than `expo/AppEntry.js`.
 *
 * AppEntry does `import App from '../../App'`, which only resolves when the
 * expo package sits at <project>/node_modules/expo/. pnpm's default store
 * layout breaks that assumption and Metro can't find the app. Registering the
 * root component here makes the project work under any package manager and
 * any node-linker setting.
 */
registerRootComponent(App);
