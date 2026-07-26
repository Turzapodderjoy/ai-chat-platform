export class HealthController {
  health() {
    return {
      status: "ok",
      timestamp: new Date(),
    };
  }
}