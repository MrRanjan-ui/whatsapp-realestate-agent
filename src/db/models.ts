import mongoose, { Schema, Document } from 'mongoose';

// Lead Interface
export interface ILead extends Document {
  name?: string;
  phone: string; // WhatsApp phone number, typically standard JID or digits
  city?: string;
  propertyType?: string;
  locationPreference?: string;
  budget?: string;
  timeline?: string;
  purchaseType?: string;
  leadScore: number;
  status: 'Cold' | 'Warm' | 'Hot';
  humanTakeover: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema: Schema = new Schema(
  {
    name: { type: String },
    phone: { type: String, required: true, unique: true, index: true },
    city: { type: String },
    propertyType: { type: String },
    locationPreference: { type: String },
    budget: { type: String },
    timeline: { type: String },
    purchaseType: { type: String },
    leadScore: { type: Number, default: 0 },
    status: { type: String, enum: ['Cold', 'Warm', 'Hot'], default: 'Cold' },
    humanTakeover: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Message Interface
export interface IMessage extends Document {
  leadId: mongoose.Types.ObjectId;
  sender: 'user' | 'bot' | 'agent';
  text: string;
  interactivePayload?: any;
  imageUrl?: string;
  timestamp: Date;
}

const MessageSchema: Schema = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  sender: { type: String, enum: ['user', 'bot', 'agent'], required: true },
  text: { type: String, required: true },
  interactivePayload: { type: Schema.Types.Mixed },
  imageUrl: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// Property Interface
export interface IProperty extends Document {
  name: string;
  location: string;
  price: string;
  priceNumeric: number; // For queries like price <= 15000000 (1.5 Cr)
  type: string; // e.g. "2 BHK", "3 BHK", "Villa", "Plot"
  isForRent?: boolean;
  amenities: string[];
  brochureUrl: string;
  imageUrl: string;
  images: string[];
  mapUrl: string;
  possessionDate: string;
  reraNumber: string;
}

const PropertySchema: Schema = new Schema({
  name: { type: String, required: true },
  location: { type: String, required: true, index: true },
  price: { type: String, required: true },
  priceNumeric: { type: Number, required: true },
  type: { type: String, required: true },
  isForRent: { type: Boolean, default: false },
  amenities: [{ type: String }],
  brochureUrl: { type: String },
  imageUrl: { type: String },
  images: [{ type: String }],
  mapUrl: { type: String },
  possessionDate: { type: String },
  reraNumber: { type: String }
});

// Appointment Interface (Site visits)
export interface IAppointment extends Document {
  leadId: mongoose.Types.ObjectId;
  propertyName: string;
  date: string; // Format: YYYY-MM-DD
  timeSlot: string; // e.g. "Morning (10:00 AM - 12:00 PM)", "Afternoon", etc.
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  createdAt: Date;
}

const AppointmentSchema: Schema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    propertyName: { type: String, required: true },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    status: { type: String, enum: ['Scheduled', 'Completed', 'Cancelled'], default: 'Scheduled' }
  },
  { timestamps: true }
);

// Models
export const Lead = mongoose.model<ILead>('Lead', LeadSchema);
export const Message = mongoose.model<IMessage>('Message', MessageSchema);
export const Property = mongoose.model<IProperty>('Property', PropertySchema);
export const Appointment = mongoose.model<IAppointment>('Appointment', AppointmentSchema);
