#include "lwip/arch.h"

#include <wasi/api.h>

#define TIME_UNIT_CONVERSION 1000000  // Nanoseconds to milliseconds

/**
 * Returns the current time in milliseconds since an arbitrary point (monotonic).
 */
u32_t sys_now(void) {
  __wasi_timestamp_t ts;
  __wasi_errno_t result = __wasi_clock_time_get(__WASI_CLOCKID_MONOTONIC, TIME_UNIT_CONVERSION, &ts);

  if (result != __WASI_ERRNO_SUCCESS) {
    return 0;
  }

  return (u32_t)(ts / TIME_UNIT_CONVERSION);  // Convert to milliseconds
}
