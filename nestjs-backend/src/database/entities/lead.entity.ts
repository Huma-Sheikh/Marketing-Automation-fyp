import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, { eager: false, nullable: true }) @JoinColumn({ name: 'userId' }) user: User;
  @Column({ nullable: true }) userId: string;
  @Column({ nullable: true }) firstName: string;
  @Column({ nullable: true }) lastName: string;
  @Column({ nullable: true }) email: string;
  @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) company: string;
  @Column({ nullable: true }) jobTitle: string;
  @Column({ nullable: true }) location: string;
  @Column({ nullable: true }) website: string;
  @Column({ nullable: true }) sourceplatform: string;
  @Column({ type: 'float', default: 0 }) score: number;
  @Column({ default: 'new' }) status: string;
  @Column({ type: 'jsonb', nullable: true }) rawData: object;
  @CreateDateColumn() createdAt: Date;
}
