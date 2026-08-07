/**
 * The one native module a mounted component still reaches for.
 *
 * The station store persists through AsyncStorage, which is native code
 * and is not there in a test process. The package ships a mock that keeps
 * the same data in memory, so the store behaves as it does on a device —
 * a saved station is read back — without a device.
 */
jest.mock(
  '@react-native-async-storage/async-storage',
  () =>
    require(
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    ),
);
