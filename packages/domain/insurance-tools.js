export const INSURANCE_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'request_otp',
      description: 'Müşterinin telefonuna kimlik doğrulama için SMS kodu gönderir.',
      parameters: {
        type: 'object',
        properties: {
          kimlik_no: { type: 'string', description: 'TC Kimlik No veya vergi no' },
          telefon: { type: 'string', description: 'Müşterinin telefon numarası' }
        },
        required: ['kimlik_no']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verify_otp',
      description: 'Müşterinin SMS ile gelen doğrulama kodunu kontrol eder.',
      parameters: {
        type: 'object',
        properties: {
          kimlik_no: { type: 'string' },
          kod: { type: 'string', description: 'SMS ile gelen doğrulama kodu' }
        },
        required: ['kimlik_no', 'kod']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_customer',
      description: 'Doğrulanmış müşterinin kayıt bilgisini getirir. Kimlik doğrulaması gerektirir.',
      parameters: {
        type: 'object',
        properties: { kimlik_no: { type: 'string' } },
        required: ['kimlik_no']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_quotes',
      description: 'Müşterinin mevcut tekliflerini listeler. Kimlik doğrulaması gerektirir.',
      parameters: {
        type: 'object',
        properties: {
          arama: { type: 'string', description: 'İsteğe bağlı arama metni (plaka, ad vb.)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_quote_details',
      description: 'Bir teklifin sigorta şirketi bazında prim ve teminat detaylarını getirir.',
      parameters: {
        type: 'object',
        properties: { teklif_id: { type: 'integer' } },
        required: ['teklif_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_quote',
      description: 'Yeni bir sigorta teklifi başlatır.',
      parameters: {
        type: 'object',
        properties: {
          brans: { type: 'string', enum: ['kasko', 'trafik', 'seyahat'] },
          plaka: { type: 'string', description: 'Kasko/Trafik için araç plakası' },
          kimlik_no: { type: 'string' }
        },
        required: ['brans']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_quote_link',
      description: 'Hazır bir teklifi müşteriye SMS/WhatsApp ile link olarak gönderir.',
      parameters: {
        type: 'object',
        properties: {
          teklif_id: { type: 'integer' },
          kanal: { type: 'string', enum: ['sms', 'whatsapp'] }
        },
        required: ['teklif_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_agent',
      description: 'Poliçeleştirme, ödeme veya karmaşık durumlar için lisanslı insan temsilciye aktarır.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string' } },
        required: ['reason']
      }
    }
  }
];

const NEEDS_AUTH = new Set(['lookup_customer', 'list_quotes', 'get_quote_details', 'send_quote_link']);

export function createInsuranceToolExecutor({ client, sessionId, callerNumber }) {
  const auth = { verified: false, kimlikNo: null };

  return {
    get verifiedKimlikNo() {
      return auth.verified ? auth.kimlikNo : null;
    },

    async execute(toolName, args = {}) {
      if (NEEDS_AUTH.has(toolName) && !auth.verified) {
        return {
          success: false,
          requiresAuth: true,
          message: 'Bu işlem için önce kimlik doğrulaması gerekiyor. Lütfen request_otp ve verify_otp kullan.'
        };
      }

      try {
        switch (toolName) {
          case 'request_otp': {
            await client.requestOtp({ kimlikNo: args.kimlik_no, telefon: args.telefon || callerNumber });
            auth.kimlikNo = args.kimlik_no;
            return { success: true, message: 'Doğrulama kodu gönderildi.' };
          }

          case 'verify_otp': {
            await client.verifyOtp({ kimlikNo: args.kimlik_no, kod: args.kod });
            auth.verified = true;
            auth.kimlikNo = args.kimlik_no;
            return { success: true, verified: true, message: 'Kimlik doğrulandı.' };
          }

          case 'lookup_customer': {
            const result = await client.getCustomer(args.kimlik_no || auth.kimlikNo);
            return { success: true, customer: result };
          }

          case 'list_quotes': {
            const result = await client.listQuotes({ kimlikNo: auth.kimlikNo, aramaMetni: args.arama || null });
            return { success: true, quotes: result };
          }

          case 'get_quote_details': {
            const result = await client.getQuoteDetails(args.teklif_id);
            return { success: true, details: result };
          }

          case 'start_quote':
            // Quoting needs a full data-collection flow; the deterministic
            // orchestrator owns that. Here we acknowledge and let it drive.
            return {
              success: true,
              action: 'start_quote',
              brans: args.brans,
              message: `${args.brans} teklifi başlatılıyor.`
            };

          case 'send_quote_link':
            return {
              success: true,
              action: 'send_link',
              teklifId: args.teklif_id,
              kanal: args.kanal || 'sms',
              message: 'Teklif linki gönderiliyor.'
            };

          case 'transfer_to_agent':
            return {
              action: 'transfer',
              reason: args.reason || 'Müşteri insan temsilci istedi.',
              message: 'Lisanslı temsilciye aktarılıyor.'
            };

          default:
            return { success: false, error: `Bilinmeyen araç: ${toolName}` };
        }
      } catch (error) {
        return { success: false, error: error.message || 'İşlem sırasında hata oluştu.' };
      }
    }
  };
}
