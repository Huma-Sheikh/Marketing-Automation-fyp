import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
@Entity('agencies')
export class Agency {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, { eager: false, nullable: true }) @JoinColumn({ name: 'ownerId' }) owner: User;
  @Column({ nullable: true }) ownerId: string;
  @Column() agencyName: string;
  @Column({ unique: true, nullable: true }) customDomain: string;
  @Column({ nullable: true }) logoUrl: string;
  @Column({ nullable: true, default: '#2563EB' }) primaryColor: string;
  @Column({ nullable: true }) accentColor: string;
  @Column({ nullable: true }) callerIdName: string;
  @Column({ nullable: true }) supportEmail: string;
  @Column({ type: 'jsonb', nullable: true }) limits: object;
  @Column({ type: 'int', default: 0 }) callsThisMonth: number;
  @Column({ default: 'active' }) status: string;
  @CreateDateColumn() createdAt: Date;
}
