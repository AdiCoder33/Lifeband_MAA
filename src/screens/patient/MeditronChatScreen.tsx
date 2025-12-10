// AI Medical Assistant Chat powered by Meditron-7B
import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import askMeditron from '../../services/meditronApi';
import { colors, spacing, typography } from '../../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_SMALL_DEVICE = SCREEN_WIDTH < 375;

const MeditronChatScreen: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const onAsk = async () => {
    setError(null);
    setAnswer('');
    if (!question.trim()) {
      setError('Please enter a question.');
      return;
    }
    setLoading(true);
    try {
      const resp = await askMeditron(question);
      setAnswer(resp);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setQuestion('');
    setAnswer('');
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* AI Assistant Header */}
        <View style={styles.aiHeader}>
          <View style={styles.aiIconContainer}>
            <Text style={styles.aiIcon}>🤖</Text>
          </View>
          <View style={styles.aiHeaderText}>
            <Text style={styles.aiTitle}>AI Medical Assistant</Text>
            <Text style={styles.aiSubtitle}>Powered by Meditron-7B • Pregnancy-safe answers</Text>
          </View>
        </View>

        {/* Question Input Card */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Ask Your Question</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., What foods should I avoid during pregnancy?"
            placeholderTextColor="rgba(64, 49, 90, 0.4)"
            multiline
            value={question}
            onChangeText={setQuestion}
            maxLength={500}
          />
          <View style={styles.inputFooter}>
            <Text style={styles.charCount}>{question.length}/500</Text>
          </View>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]} 
              onPress={onAsk} 
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Text style={styles.buttonIcon}>✨</Text>
                  <Text style={styles.buttonText}>Ask AI</Text>
                </>
              )}
            </TouchableOpacity>
            
            {(answer || question) && !loading && (
              <TouchableOpacity 
                style={[styles.button, styles.buttonSecondary]} 
                onPress={clearChat}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonTextSecondary}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}
        </View>

        {/* Answer Section */}
        {(loading || answer) && (
          <View style={styles.answerSection}>
            <View style={styles.answerHeader}>
              <Text style={styles.answerLabel}>💡 AI Response</Text>
              {loading && (
                <View style={styles.loadingBadge}>
                  <ActivityIndicator size="small" color={colors.secondary} />
                  <Text style={styles.loadingBadgeText}>Analyzing...</Text>
                </View>
              )}
            </View>
            
            <View style={styles.answerCard}>
              {loading && !answer ? (
                <View style={styles.loadingContainer}>
                  <View style={styles.loadingIconContainer}>
                    <Text style={styles.loadingIcon}>🧠</Text>
                  </View>
                  <Text style={styles.loadingTitle}>AI is thinking...</Text>
                  <Text style={styles.loadingText}>Analyzing your question with medical expertise</Text>
                  <View style={styles.dotsContainer}>
                    <View style={[styles.dot, styles.dot1]} />
                    <View style={[styles.dot, styles.dot2]} />
                    <View style={[styles.dot, styles.dot3]} />
                  </View>
                </View>
              ) : answer ? (
                <View>
                  <Text style={styles.answerText}>{answer}</Text>
                  <View style={styles.disclaimer}>
                    <Text style={styles.disclaimerIcon}>ℹ️</Text>
                    <Text style={styles.disclaimerText}>
                      This is AI-generated information. Always consult your doctor for medical advice.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Empty State */}
        {!loading && !answer && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>Ask anything about pregnancy</Text>
            <Text style={styles.emptyText}>
              Get instant, evidence-based answers to your questions about prenatal care, nutrition, symptoms, and more.
            </Text>
            <View style={styles.suggestionContainer}>
              <Text style={styles.suggestionTitle}>Try asking:</Text>
              {[
                'What vitamins should I take?',
                'Is it safe to exercise during pregnancy?',
                'How to manage morning sickness?',
              ].map((suggestion, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.suggestionChip}
                  onPress={() => setQuestion(suggestion)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: IS_SMALL_DEVICE ? spacing.md : spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  
  // AI Header
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: IS_SMALL_DEVICE ? spacing.md : spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  aiIconContainer: {
    width: IS_SMALL_DEVICE ? 50 : 60,
    height: IS_SMALL_DEVICE ? 50 : 60,
    borderRadius: IS_SMALL_DEVICE ? 25 : 30,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  aiIcon: {
    fontSize: IS_SMALL_DEVICE ? 28 : 32,
  },
  aiHeaderText: {
    flex: 1,
  },
  aiTitle: {
    fontSize: IS_SMALL_DEVICE ? 18 : 20,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  aiSubtitle: {
    fontSize: IS_SMALL_DEVICE ? 11 : 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // Input Card
  inputCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: IS_SMALL_DEVICE ? spacing.md : spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  inputLabel: {
    fontSize: IS_SMALL_DEVICE ? 14 : 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: IS_SMALL_DEVICE ? 100 : 120,
    borderColor: `${colors.primary}20`,
    borderWidth: 2,
    borderRadius: 16,
    padding: spacing.md,
    fontSize: IS_SMALL_DEVICE ? 14 : 15,
    textAlignVertical: 'top',
    color: colors.textPrimary,
    backgroundColor: `${colors.primary}05`,
  },
  inputFooter: {
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  charCount: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: IS_SMALL_DEVICE ? 14 : 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  buttonPrimary: {
    backgroundColor: colors.secondary,
    shadowColor: colors.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  buttonIcon: {
    fontSize: 16,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: IS_SMALL_DEVICE ? 14 : 15,
  },
  buttonTextSecondary: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: IS_SMALL_DEVICE ? 14 : 15,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.critical}10`,
    borderRadius: 12,
    padding: spacing.sm,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  errorIcon: {
    fontSize: 18,
  },
  error: {
    flex: 1,
    color: colors.critical,
    fontSize: IS_SMALL_DEVICE ? 12 : 13,
    fontWeight: '600',
  },

  // Answer Section
  answerSection: {
    marginBottom: spacing.lg,
  },
  answerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  answerLabel: {
    fontSize: IS_SMALL_DEVICE ? 15 : 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  loadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.secondary}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  loadingBadgeText: {
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
  },
  answerCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: IS_SMALL_DEVICE ? spacing.md : spacing.lg,
    minHeight: 150,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  // Loading State
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  loadingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.secondary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  loadingIcon: {
    fontSize: 40,
  },
  loadingTitle: {
    fontSize: IS_SMALL_DEVICE ? 16 : 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  loadingText: {
    fontSize: IS_SMALL_DEVICE ? 13 : 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondary,
  },
  dot1: {
    opacity: 0.3,
  },
  dot2: {
    opacity: 0.6,
  },
  dot3: {
    opacity: 1,
  },

  // Answer Text
  answerText: {
    color: colors.textPrimary,
    fontSize: IS_SMALL_DEVICE ? 14 : 15,
    lineHeight: IS_SMALL_DEVICE ? 22 : 24,
    marginBottom: spacing.md,
  },
  disclaimer: {
    flexDirection: 'row',
    backgroundColor: `${colors.primary}08`,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  disclaimerIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  disclaimerText: {
    flex: 1,
    fontSize: IS_SMALL_DEVICE ? 11 : 12,
    color: colors.textSecondary,
    lineHeight: 16,
    fontStyle: 'italic',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: IS_SMALL_DEVICE ? 18 : 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: IS_SMALL_DEVICE ? 13 : 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  suggestionContainer: {
    width: '100%',
    marginTop: spacing.md,
  },
  suggestionTitle: {
    fontSize: IS_SMALL_DEVICE ? 12 : 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  suggestionChip: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
  },
  suggestionText: {
    fontSize: IS_SMALL_DEVICE ? 13 : 14,
    color: colors.primary,
    fontWeight: '500',
  },
});

export default MeditronChatScreen;
