import { Agency } from './agency.entity';
import { Call } from './call.entity';
import { Campaign } from './campaign.entity';
import { Lead } from './lead.entity';
import { PhoneNumber } from './phone-number.entity';
import { Subscription } from './subscription.entity';
import { User } from './user.entity';

export { Agency, Call, Campaign, Lead, PhoneNumber, Subscription, User };

/** Every TypeORM entity, registered once in DatabaseModule. */
export const ENTITIES = [User, Lead, Campaign, Call, Agency, Subscription, PhoneNumber];
