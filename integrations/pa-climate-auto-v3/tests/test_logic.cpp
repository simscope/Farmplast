#include <cassert>
#include <cmath>
#include <iostream>
#include "../FarmplastClimate/ClimateLogic.h"
using namespace ClimateLogic;
int main() {
  Input a{true,68,true,72,72,2,5,false,Mode::AUTO,false};
  auto r=evaluate(a); assert(r.hasTemperature && r.averageF==70 && r.wantHeat && !r.degraded);
  a.previouslyHeating=true; r=evaluate(a); assert(r.wantHeat);
  a.sensor2OK=false; r=evaluate(a); assert(r.degraded && r.averageF==68 && r.wantHeat);
  a.sensor1OK=false; a.mode=Mode::MANUAL; a.manualHeat=true; r=evaluate(a);
  assert(!r.hasTemperature && !r.wantHeat);
  a.sensor1OK=true; a.sensor2OK=true; a.sensor1F=66; a.sensor2F=77;
  r=evaluate(a); assert(r.disagreement);
  a.mode=Mode::OFF; r=evaluate(a); assert(!r.wantHeat);
  std::cout << "PASS: average/hysteresis/fallback/failsafe/disagreement/mode\n";
}