import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EmailService } from './email.service';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  constructor(private email: EmailService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'welcome-user') {
      await this.email.sendWelcomeEmail(job.data.to, job.data.name);
      return;
    }
    if (job.name === 'welcome-business') {
      await this.email.sendBusinessWelcomeEmail(job.data.to, job.data.businessName);
      return;
    }
    if (job.name === 'password-reset') {
      await this.email.sendPasswordResetEmail(job.data.to, job.data.name, job.data.resetUrl);
      return;
    }
    if (job.name === 'general') {
      // Used for broadcast-style updates — see EmailModule's exported
      // EmailService.send() for how to enqueue an arbitrary announcement
      // to one or many recipients without touching this processor.
      await this.email.send(job.data);
    }
  }
}
