import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Lead } from './lead.entity';
import { Campaign } from './campaign.entity';
@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => Lead, { eager: false, nullable: true }) @JoinColumn({ name: 'leadId' }) lead: Lead;
  @Column({ nullable: true }) leadId: string;
  @ManyToOne(() => Campaign, { eager: false, nullable: true }) @JoinColumn({ name: 'campaignId' }) campaign: Campaign;
  @Column({ nullable: true }) campaignId: string;
  @Column({ nullable: true }) twilioCallSid: string;
  /** twilio | sip_trunk | vapi — which route placed the call. */
  @Column({ default: 'twilio' }) provider: string;
  /** The provider's own call id when it is not Twilio (e.g. the Vapi call id). */
  @Index() @Column({ nullable: true }) providerCallId: string;
  /** The tenant number the call went out on; null = the platform's number. */
  @Column({ nullable: true }) phoneNumberId: string;
  @Column({ default: 'initiated' }) status: string;
  @Column({ type: 'int', default: 0 }) durationSeconds: number;
  @Column({ type: 'text', nullable: true }) transcript: string;
  @Column({ nullable: true }) outcome: string;
  @Column({ type: 'text', nullable: true }) recordingUrl: string;
  @CreateDateColumn() createdAt: Date;
}
