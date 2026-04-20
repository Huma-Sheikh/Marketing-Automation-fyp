import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
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
  @Column({ default: 'initiated' }) status: string;
  @Column({ type: 'int', default: 0 }) durationSeconds: number;
  @Column({ type: 'text', nullable: true }) transcript: string;
  @Column({ nullable: true }) outcome: string;
  @Column({ type: 'text', nullable: true }) recordingUrl: string;
  @CreateDateColumn() createdAt: Date;
}
