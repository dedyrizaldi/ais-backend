import { Controller, Get, Param, NotFoundException } from '@nestjs/common';

import { ReceiverService } from './receiver.service';

@Controller('receivers')
export class ReceiverController {
  constructor(private readonly receiverService: ReceiverService) {}

  @Get()
  findAll() {
    return this.receiverService.findAll();
  }

  @Get('base-url')
  getBaseUrl() {
    return {
      baseUrl: this.receiverService.getBaseUrl(),
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const receiver = this.receiverService.findById(id);

    if (!receiver) {
      throw new NotFoundException(`Receiver '${id}' not found`);
    }

    return receiver;
  }
}
