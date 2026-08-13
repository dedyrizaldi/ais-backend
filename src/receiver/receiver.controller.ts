import { Controller, Get, Param, Post } from '@nestjs/common';

import { ReceiverService } from './receiver.service';

@Controller('receivers')
export class ReceiverController {
  constructor(private readonly receiverService: ReceiverService) {}

  /**
   * ============================================================
   * GET ALL RECEIVERS
   * ============================================================
   *
   * Mengambil receiver dari konfigurasi vts.json.
   *
   * GET /receivers
   */
  @Get()
  findAll() {
    const receivers = this.receiverService.findAll();

    return {
      data: receivers,

      meta: {
        total: receivers.length,
      },
    };
  }

  /**
   * ============================================================
   * GET BASE URL
   * ============================================================
   *
   * GET /receivers/base-url
   */
  @Get('base-url')
  getBaseUrl() {
    return {
      baseUrl: this.receiverService.getBaseUrl(),
    };
  }

  /**
   * ============================================================
   * GET ALL RECEIVERS FROM DATABASE
   * ============================================================
   *
   * Mengambil receiver langsung dari PostgreSQL.
   *
   * GET /receivers/database
   */
  @Get('database')
  async findAllFromDatabase() {
    const receivers = await this.receiverService.findAllFromDatabase();

    return {
      data: receivers,

      meta: {
        total: receivers.length,
      },
    };
  }

  /**
   * ============================================================
   * RELOAD RECEIVERS
   * ============================================================
   *
   * Membaca ulang vts.json dan
   * melakukan sinkronisasi ke PostgreSQL.
   *
   * POST /receivers/reload
   */
  @Post('reload')
  async reload() {
    await this.receiverService.reload();

    const receivers = this.receiverService.findAll();

    return {
      success: true,

      data: receivers,

      meta: {
        total: receivers.length,
      },
    };
  }

  /**
   * ============================================================
   * GET RECEIVER FROM DATABASE
   * ============================================================
   *
   * GET /receivers/database/:id
   *
   * Contoh:
   *
   * /receivers/database/receiver-1
   */
  @Get('database/:id')
  async findOneFromDatabase(@Param('id') id: string) {
    const receiver = await this.receiverService.findOneFromDatabase(id);

    if (!receiver) {
      return {
        data: null,

        meta: {
          found: false,
        },
      };
    }

    return {
      data: receiver,

      meta: {
        found: true,
      },
    };
  }

  /**
   * ============================================================
   * GET RECEIVER BY CONFIG ID
   * ============================================================
   *
   * Mengambil receiver dari konfigurasi
   * vts.json berdasarkan ID.
   *
   * GET /receivers/:id
   *
   * Contoh:
   *
   * /receivers/receiver-1
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    const receiver = this.receiverService.findById(id);

    if (!receiver) {
      return {
        data: null,

        meta: {
          found: false,
        },
      };
    }

    return {
      data: receiver,

      meta: {
        found: true,
      },
    };
  }
}
