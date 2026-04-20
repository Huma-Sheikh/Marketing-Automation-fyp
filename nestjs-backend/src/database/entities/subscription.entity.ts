import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid') id: string;
  @OneToOne(() => User) @JoinColumn({ name: 'userId' }) user: User;
  @Column({ nullable: true }) userId: string;
  @Column({ nullable: true }) stripeCustomerId: string;
  @Column({ nullable: true }) stripeSubscriptionId: string;
  @Column({ default: 'free' }) plan: string;
  @Column({ default: 'active' }) status: string;
  @Column({ type: 'timestamp', nullable: true }) currentPeriodEnd: Date;
  @Column({ type: 'int', default: 0 }) callsThisMonth: number;
  @Column({ type: 'int', default: 0 }) leadsCount: number;
  @CreateDateColumn() createdAt: Date;
}
