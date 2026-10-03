import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column() passwordHash: string;
  @Column() businessName: string;
  @Column({ nullable: true }) phoneNumber: string;
  /**
   * What the AI voice agent is allowed to say on this company's behalf, captured
   * at onboarding. Shape matches CompanyProfile in python-services/llm-service:
   * { name, industry, agent_name, offering, value_props[], pricing, proof, cta,
   *   must_not_say[], extra }. Null means the agent falls back to its generic
   * script. Facts only — the behavioural guardrails live in the LLM service so a
   * tenant cannot edit them away.
   */
  @Column({ type: 'jsonb', nullable: true }) salesProfile: Record<string, any>;
  @Column({ default: 'active' }) status: string;
  @CreateDateColumn() createdAt: Date;
}
