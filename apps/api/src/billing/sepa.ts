// Minimal SEPA Core Direct Debit (pain.008.001.02) generator for Spanish
// domiciliaciones. MVP simplification: sequence type is always RCUR (banks
// accept it for first use since the Nov-2016 scheme change) and BIC is
// NOTPROVIDED (IBAN-only routing). Tracked as future work.

export type SepaCreditor = {
  name: string;
  iban: string;
  creditorId: string;
};

export type SepaTransaction = {
  endToEndId: string;
  amount: string; // formatted with 2 decimals, e.g. "75.00"
  mandateId: string;
  mandateDate: string; // "YYYY-MM-DD"
  debtorName: string;
  debtorIban: string;
  remittanceInfo: string;
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

export function generateMessageId(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.]/g, '')
    .slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REM-${ts}-${rand}`;
}

export function buildSepaXml(params: {
  messageId: string;
  creationDateTime: Date;
  collectionDate: string; // "YYYY-MM-DD"
  creditor: SepaCreditor;
  transactions: SepaTransaction[];
}): string {
  const { messageId, creationDateTime, collectionDate, creditor, transactions } =
    params;

  const nbOfTxs = transactions.length;
  const ctrlSum = transactions
    .reduce((sum, t) => sum + Number(t.amount), 0)
    .toFixed(2);
  const creDtTm = creationDateTime.toISOString().slice(0, 19);
  const pmtInfId = `${messageId}-PMT`;

  const txXml = transactions
    .map(
      (t) => `      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${esc(t.endToEndId)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${t.amount}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${esc(t.mandateId)}</MndtId>
            <DtOfSgntr>${t.mandateDate}</DtOfSgntr>
            <AmdmntInd>false</AmdmntInd>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId>
            <Othr>
              <Id>NOTPROVIDED</Id>
            </Othr>
          </FinInstnId>
        </DbtrAgt>
        <Dbtr>
          <Nm>${esc(t.debtorName)}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${cleanIban(t.debtorIban)}</IBAN>
          </Id>
        </DbtrAcct>
        <RmtInf>
          <Ustrd>${esc(t.remittanceInfo)}</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(messageId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${esc(creditor.name)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(pmtInfId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>CORE</Cd>
        </LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${collectionDate}</ReqdColltnDt>
      <Cdtr>
        <Nm>${esc(creditor.name)}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${cleanIban(creditor.iban)}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </FinInstnId>
      </CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>${esc(creditor.creditorId)}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>
${txXml}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>
`;
}
