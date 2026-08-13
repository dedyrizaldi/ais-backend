import { Controller, Get, Query } from '@nestjs/common';

import { TcpService } from './tcp.service';

@Controller('tcp')
export class TcpController {
  constructor(private readonly tcpService: TcpService) {}

  /**
   * ============================================================
   * TCP STATUS
   * ============================================================
   *
   * Mengambil status seluruh TCP receiver.
   *
   * GET /tcp/status
   *
   * Semua receiver:
   * /tcp/status
   *
   * Hanya connected:
   * /tcp/status?connected=true
   *
   * Hanya disconnected:
   * /tcp/status?connected=false
   */
  @Get('status')
  getStatus(@Query('connected') connected?: string) {
    /**
     * ========================================================
     * ALL TCP STATUS
     * ========================================================
     */
    const all = this.tcpService.getStatus();

    /**
     * ========================================================
     * FILTER
     * ========================================================
     *
     * Jika query connected tidak diberikan,
     * tampilkan seluruh receiver.
     */
    let data = all;

    if (connected === 'true') {
      data = all.filter((receiver) => receiver.connected === true);
    }

    if (connected === 'false') {
      data = all.filter((receiver) => receiver.connected === false);
    }

    /**
     * ========================================================
     * SUMMARY
     * ========================================================
     */
    const total = all.length;

    const connectedTotal = all.filter((receiver) => receiver.connected).length;

    const disconnectedTotal = total - connectedTotal;

    /**
     * ========================================================
     * RESPONSE
     * ========================================================
     */
    return {
      data,

      meta: {
        total,

        connected: connectedTotal,

        disconnected: disconnectedTotal,

        returned: data.length,
      },
    };
  }

  /**
   * ============================================================
   * TCP COUNT
   * ============================================================
   *
   * GET /tcp/count
   */
  @Get('count')
  getCount() {
    const total = this.tcpService.getTotalCount();

    const connected = this.tcpService.getConnectedCount();

    return {
      total,

      connected,

      disconnected: total - connected,
    };
  }
}
