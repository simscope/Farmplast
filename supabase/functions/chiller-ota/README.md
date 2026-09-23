# LEGACY — required only by old CH2/CH3 firmware

Keep the currently deployed function and its existing secrets during the transition.
The telemetry-piggyback firmware and Firmware Programming UI no longer call it.
Do not delete or redeploy this function as part of the Edge-free PR. Retire it only
after both physical controllers pass the replacement architecture's runtime tests
and the operator explicitly approves cleanup. CH1 uses its separate OTA service.
