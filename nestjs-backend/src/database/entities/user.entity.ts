import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column() passwordHash: string;
  @Column() businessName: string;
  @Column({ nullable: true }) phoneNumber: string;
  @Column({ default: 'active' }) status: string;
  @CreateDateColumn() createdAt: Date;
}
