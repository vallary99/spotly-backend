import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';

// Wraps Safaricom's Daraja API. When MPESA_CONSUMER_KEY/SECRET are unset
// (as they will be until real credentials are provided — see the README
// checklist), this falls back to a simulated STK Push so the rest of the
// payment flow (idempotent callback handling, subscription state update)
// can be built and tested end-to-end without live credentials.
@Injectable()
export class DarajaService {
  private readonly logger = new Logger(DarajaService.name);
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl =
      this.config.get('MPESA_ENV') === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';
  }

  private isConfigured(): boolean {
    return Boolean(this.config.get('MPESA_CONSUMER_KEY') && this.config.get('MPESA_CONSUMER_SECRET'));
  }

  private async getAccessToken(): Promise<string> {
    const key = this.config.get('MPESA_CONSUMER_KEY');
    const secret = this.config.get('MPESA_CONSUMER_SECRET');
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const { data } = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return data.access_token;
  }

  // Initiates STK Push. Returns identifiers used as the idempotency key
  // on the Payment row (CheckoutRequestID) so a retried/duplicated
  // callback can never double-credit a subscription.
  async initiateStkPush(params: {
    phoneNumber: string; // format 2547XXXXXXXX
    amount: number;
    accountReference: string;
    transactionDesc: string;
  }): Promise<{ checkoutRequestId: string; merchantRequestId: string; simulated: boolean }> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'MPESA_CONSUMER_KEY/SECRET not set — simulating STK Push. Provide real Daraja credentials to go live.',
      );
      return {
        checkoutRequestId: `SIM-${randomUUID()}`,
        merchantRequestId: `SIM-${randomUUID()}`,
        simulated: true,
      };
    }

    const shortcode = this.config.get('MPESA_SHORTCODE');
    const passkey = this.config.get('MPESA_PASSKEY');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const token = await this.getAccessToken();

    const { data } = await axios.post(
      `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: params.amount,
        PartyA: params.phoneNumber,
        PartyB: shortcode,
        PhoneNumber: params.phoneNumber,
        CallBackURL: this.config.get('MPESA_CALLBACK_URL'),
        AccountReference: params.accountReference,
        TransactionDesc: params.transactionDesc,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return {
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      simulated: false,
    };
  }
}
