import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** The bank returned a direct-debit receipt (devolución). */
export class ReturnReceiptDto {
  /** Bank reason, e.g. "AM04 — Fondos insuficientes". */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;

  /** Fee the bank charged the academy for the return. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bankFee?: number;

  /** Pass the bank fee on to the family as its own invoice. */
  @IsOptional()
  @IsBoolean()
  chargeFee?: boolean;

  /** Email the family that the receipt was returned and is still owed. */
  @IsOptional()
  @IsBoolean()
  notifyFamily?: boolean;
}
