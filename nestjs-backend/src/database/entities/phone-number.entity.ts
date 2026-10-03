import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

/**
 * A caller number a tenant has attached for the AI voice agent to dial out on.
 *
 * `provider` is HOW the call is placed (see phone-numbers/providers.ts);
 * `carrier` is WHO owns the number (Jazz, Zong, Twilio, Vapi, ...) and is
 * informational — two Jazz numbers can be wired up completely differently.
 */
@Entity('phone_numbers')
@Index(['userId', 'number'], { unique: true })
export class PhoneNumber {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, { eager: false, nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user: User;
  @Column() userId: string;
  @Column({ nullable: true }) label: string;
  /** E.164, e.g. +923001234567. */
  @Column() number: string;
  @Column() carrier: string;
  @Column() provider: string;
  /**
   * AES-256-GCM ciphertext of the provider credentials (API keys, auth tokens).
   * Never returned to the client — see PhoneNumbersService.toPublic.
   */
  @Column({ type: 'text', nullable: true }) credentials: string;
  /** pending | verified | failed */
  @Column({ default: 'pending' }) status: string;
  @Column({ type: 'text', nullable: true }) statusMessage: string;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date;
  @Column({ default: false }) isDefault: boolean;
  @CreateDateColumn() createdAt: Date;
}
