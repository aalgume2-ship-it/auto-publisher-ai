/** Library module — unified media library from real DB/S3 data. */
import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller.js';

@Module({
  controllers: [LibraryController],
})
export class LibraryModule {}
