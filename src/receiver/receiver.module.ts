import { Module } from '@nestjs/common';

import { ReceiverController } from './receiver.controller';
import { ReceiverService } from './receiver.service';

@Module({
  controllers: [ReceiverController],

  providers: [ReceiverService],

  exports: [ReceiverService],
})
export class ReceiverModule {}
