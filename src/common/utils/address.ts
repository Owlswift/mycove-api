import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface AddressInput {
  house?: string;
  street?: string;
  houseNumber?: string;
}

export interface ResolvedAddress {
  house?: string;
  street?: string;
  houseNumber?: string;
}

/** "12" + "Palm Street" → "12 Palm Street" — what every screen that shows a house displays. */
export function composeHouse(houseNumber: string, street: string): string {
  return `${houseNumber.trim()} ${street.trim()}`;
}

/**
 * Turns whatever address fields a client sent into the columns to store.
 *
 * Street + house number is the preferred path: the street must be one of
 * the estate's preloaded streets (matched case-insensitively and stored in
 * the admin's spelling), and `house` is composed from the two. A bare
 * free-text `house` is still accepted so estates that haven't loaded any
 * streets — and older app builds — keep working.
 */
export async function resolveAddress(
  prisma: PrismaService,
  estateId: string,
  input: AddressInput,
): Promise<ResolvedAddress> {
  const street = input.street?.trim();
  const houseNumber = input.houseNumber?.trim();

  if (!street && !houseNumber) {
    const house = input.house?.trim();
    return house ? { house } : {};
  }

  if (!street) throw new BadRequestException('Select a street.');
  if (!houseNumber) throw new BadRequestException('Enter a house number.');

  const estate = await prisma.estate.findUniqueOrThrow({
    where: { id: estateId },
    select: { streets: true },
  });
  const canonical = estate.streets.find(
    (s) => s.toLowerCase() === street.toLowerCase(),
  );
  if (!canonical) {
    throw new BadRequestException('That street is not on the estate’s list.');
  }

  return {
    street: canonical,
    houseNumber,
    house: composeHouse(houseNumber, canonical),
  };
}
