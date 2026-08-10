import { Injectable } from '@nestjs/common';

import { AisParser } from './parser/ais-parser';
import { AisFragmentAssembler } from './assembler/ais-fragment-assembler';
import { AisDecoderService } from './decoder/ais-decoder.service';

import { VesselService } from '../vessel/vessel.service';
import { Vessel } from '../vessel/interfaces/vessel.interface';

import { AisGateway } from '../gateway/ais.gateway';

@Injectable()
export class AisService {
  private readonly parser = new AisParser();

  private readonly assembler = new AisFragmentAssembler();

  constructor(
    private readonly decoder: AisDecoderService,
    private readonly vesselService: VesselService,
    private readonly gateway: AisGateway,
  ) {}

  /**
   * Handle satu AIS sentence
   */
  handle(
    receiverId: string,
    receiverName: string,
    sentence: string,
  ): Vessel | null {
    /**
     * Parse sentence menjadi fragment
     */
    const fragment = this.parser.parse(receiverId, receiverName, sentence);

    if (!fragment) {
      return null;
    }

    /**
     * Debug fragment
     *
     * Berguna untuk melihat Type 5 multipart.
     */
    // if (fragment.total > 1) {
    //   console.log('\n========== AIS FRAGMENT ==========');

    //   console.log('Receiver    :', fragment.receiverName);
    //   console.log('Total       :', fragment.total);
    //   console.log('Current     :', fragment.current);
    //   console.log('Sequence ID :', fragment.sequenceId);
    //   console.log('Channel     :', fragment.channel);
    //   console.log('Payload     :', fragment.payload);
    //   console.log('Fill Bits   :', fragment.fillBits);

    //   console.log('==================================\n');
    // }

    /**
     * Assemble multipart message
     */
    const completed = this.assembler.assemble(fragment);

    /**
     * Belum lengkap
     */
    if (!completed) {
      return null;
    }

    /**
     * Debug completed AIS
     */
    // if (fragment.total > 1) {
    //   console.log('\n========== AIS COMPLETED ==========');

    //   console.log('Receiver    :', completed.receiverName);
    //   console.log('Channel     :', completed.channel);
    //   console.log('Payload     :', completed.payload);
    //   console.log('Payload Len :', completed.payload.length);
    //   console.log('Fill Bits   :', completed.fillBits);

    //   console.log('Raw:');
    //   console.log(completed.raw);

    //   console.log('====================================\n');
    // }

    /**
     * Decode AIS
     */
    const decoded = this.decoder.decode(completed);

    if (!decoded) {
      return null;
    }

    /**
     * Debug hasil decoder
     */
    // console.log('\n========== AIS DECODED ==========');

    // console.log('Receiver    :', decoded.receiverName);
    // console.log('MessageType :', decoded.messageType);
    // console.log('MMSI        :', decoded.mmsi);
    // console.log('Ship Name   :', decoded.shipname);
    // console.log('Callsign    :', decoded.callsign);
    // console.log('IMO         :', decoded.imo);
    // console.log('Destination :', decoded.destination);

    // console.log('Latitude    :', decoded.lat);
    // console.log('Longitude   :', decoded.lon);
    // console.log('SOG         :', decoded.sog);
    // console.log('COG         :', decoded.cog);

    // console.log('=================================\n');

    /**
     * Update Vessel Cache
     */
    const vessel = this.vesselService.update(decoded);

    /**
     * Broadcast object vessel yang sama
     */
    this.gateway.broadcastVessel(vessel);

    /**
     * Return vessel
     */
    return vessel;
  }
}
