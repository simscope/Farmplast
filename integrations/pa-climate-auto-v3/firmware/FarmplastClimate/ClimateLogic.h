#pragma once
#include <math.h>

// Pure thermostat logic; Arduino-independent so it can be tested on a PC.
namespace ClimateLogic {

enum class Mode : unsigned char { AUTO, MANUAL, OFF };

struct Input {
  bool sensor1OK;
  float sensor1F;
  bool sensor2OK;
  float sensor2F;
  float targetF;
  float hysteresisF;
  float disagreementLimitF;
  bool previouslyHeating;
  Mode mode;
  bool manualHeat;
};

struct Result {
  bool hasTemperature;
  bool degraded;
  bool disagreement;
  float averageF;  // NAN when neither sensor is valid
  bool wantHeat;
};

inline Result evaluate(const Input &in) {
  Result out{};
  const bool a = in.sensor1OK && isfinite(in.sensor1F);
  const bool b = in.sensor2OK && isfinite(in.sensor2F);
  out.hasTemperature = a || b;
  out.degraded = a != b;
  out.disagreement = a && b && fabsf(in.sensor1F - in.sensor2F) > in.disagreementLimitF;
  out.averageF = a && b ? (in.sensor1F + in.sensor2F) * 0.5f :
                 a ? in.sensor1F : b ? in.sensor2F : NAN;

  // Sensor failures always override MANUAL heating.
  if (!out.hasTemperature || in.mode == Mode::OFF) {
    out.wantHeat = false;
  } else if (in.mode == Mode::MANUAL) {
    out.wantHeat = in.manualHeat;
  } else {
    const float half = in.hysteresisF * 0.5f;
    out.wantHeat = in.previouslyHeating
      ? out.averageF < in.targetF + half
      : out.averageF <= in.targetF - half;
  }
  return out;
}

}  // namespace ClimateLogic