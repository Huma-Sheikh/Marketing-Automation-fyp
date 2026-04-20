import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, { eager: false, nullable: true }) @JoinColumn({ name: 'userId' }) user: User;
  @Column({ nullable: true }) userId: string;
  @Column() name: string;
  @Column() type: string;
  @Column({ default: 'draft' }) status: string;
  @Column({ type: 'jsonb', nullable: true }) settings: object;
  @Column({ type: 'int', default: 0 }) totalLeads: number;
  @Column({ type: 'int', default: 0 }) contactedCount: number;
  @Column({ type: 'int', default: 0 }) qualifiedCount: number;
  @Column({ type: 'int', default: 0 }) convertedCount: number;
  @CreateDateColumn() createdAt: Date;
}
