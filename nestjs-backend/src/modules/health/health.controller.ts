import { Controller, Get } from '@nestjs/common';

/**
 * Liveness probe for Docker/nginx/uptime checks. Unauthenticated and cheap on
 * purpose: it reports that this process is serving requests, nothing more. The
 * Python AI services have their own status at GET /api/ai/health.
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() };
  }
}
