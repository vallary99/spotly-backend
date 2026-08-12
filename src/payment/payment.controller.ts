import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/payment.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('payments/mpesa')
export class PaymentController {
  constructor(private service: PaymentService) {}

  @Post('stk-push')
  initiate(@Body() dto: InitiatePaymentDto) {
    return this.service.initiate(dto);
  }

  // GET /payments/mpesa/:id/status — frontend polls this after initiate()
  // until status leaves PENDING, since the real confirmation is async
  // (Daraja's callback), not part of the initiate response.
  @Get(':id/status')
  getStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getStatus(id, user.userId);
  }

  // Daraja calls this server-to-server — no user JWT will be attached, so
  // it must be @Public(). Authenticity instead relies on validating the
  // payload shape and (in production) IP-allowlisting Safaricom's ranges.
  @Public()
  @Post('callback')
  callback(@Body() body: any) {
    return this.service.handleCallback(body);
  }
}
